/**
 * Exercise: Sliding Window Median with Two Heaps
 *
 * Maintain a max-heap for the lower half and a min-heap for the upper half.
 * Lazy deletion avoids arbitrary heap removal; a frequency map validates
 * outgoing values. Each add/remove is O(log k) amortized.
 */

class BinaryHeap {
  constructor(compare) {
    this.values = [];
    this.compare = compare;
  }
  get size() { return this.values.length; }
  peek() { return this.values[0]; }

  push(value) {
    const data = this.values;
    data.push(value);
    let index = data.length - 1;
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (!this.compare(data[index], data[parent])) break;
      [data[index], data[parent]] = [data[parent], data[index]];
      index = parent;
    }
  }

  pop() {
    if (this.values.length === 0) return undefined;
    const data = this.values;
    const root = data[0];
    const last = data.pop();
    if (data.length > 0) {
      data[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let best = index;
        if (left < data.length && this.compare(data[left], data[best])) best = left;
        if (right < data.length && this.compare(data[right], data[best])) best = right;
        if (best === index) break;
        [data[index], data[best]] = [data[best], data[index]];
        index = best;
      }
    }
    return root;
  }
}

class SlidingWindowMedian {
  constructor() {
    this.lower = new BinaryHeap((a, b) => a > b);
    this.upper = new BinaryHeap((a, b) => a < b);
    this.delayed = new Map();
    this.frequency = new Map();
    this.lowerSize = 0;
    this.upperSize = 0;
  }

  get size() { return this.lowerSize + this.upperSize; }

  _prune(heap) {
    while (heap.size > 0) {
      const value = heap.peek();
      const pending = this.delayed.get(value) || 0;
      if (pending === 0) break;
      heap.pop();
      if (pending === 1) this.delayed.delete(value);
      else this.delayed.set(value, pending - 1);
    }
  }

  _rebalance() {
    this._prune(this.lower);
    this._prune(this.upper);
    if (this.lowerSize > this.upperSize + 1) {
      const value = this.lower.pop();
      this.lowerSize--;
      this.upper.push(value);
      this.upperSize++;
      this._prune(this.lower);
    } else if (this.lowerSize < this.upperSize) {
      const value = this.upper.pop();
      this.upperSize--;
      this.lower.push(value);
      this.lowerSize++;
      this._prune(this.upper);
    }
  }

  add(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("values must be finite numbers");
    }
    this._prune(this.lower);
    if (this.lowerSize === 0 || value <= this.lower.peek()) {
      this.lower.push(value);
      this.lowerSize++;
    } else {
      this.upper.push(value);
      this.upperSize++;
    }
    this.frequency.set(value, (this.frequency.get(value) || 0) + 1);
    this._rebalance();
    return this;
  }

  remove(value) {
    const count = this.frequency.get(value) || 0;
    if (count === 0) throw new RangeError("cannot remove a value not in the window");
    if (count === 1) this.frequency.delete(value);
    else this.frequency.set(value, count - 1);

    // Decide which logical heap owns the value before marking it delayed.
    // Pruning both heaps here could consume an equal duplicate from the wrong side.
    this._prune(this.lower);
    this._prune(this.upper);
    this.delayed.set(value, (this.delayed.get(value) || 0) + 1);

    if (this.lowerSize > 0 && value <= this.lower.peek()) {
      this.lowerSize--;
      if (value === this.lower.peek()) this._prune(this.lower);
    } else {
      this.upperSize--;
      if (this.upper.size > 0 && value === this.upper.peek()) this._prune(this.upper);
    }
    this._rebalance();
    return this;
  }

  median() {
    if (this.size === 0) throw new RangeError("median of an empty window");
    this._prune(this.lower);
    this._prune(this.upper);
    if (this.lowerSize > this.upperSize) return this.lower.peek();
    return (this.lower.peek() + this.upper.peek()) / 2;
  }
}

function medianSlidingWindow(values, windowSize) {
  if (!Array.isArray(values)) throw new TypeError("values must be an array");
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > values.length) {
    throw new RangeError("windowSize must be between 1 and values.length");
  }
  const window = new SlidingWindowMedian();
  const result = [];
  for (let index = 0; index < windowSize; index++) window.add(values[index]);
  result.push(window.median());
  for (let index = windowSize; index < values.length; index++) {
    window.remove(values[index - windowSize]);
    window.add(values[index]);
    result.push(window.median());
  }
  return result;
}

// ------------------------------ Tests -------------------------------------

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + ": expected " + JSON.stringify(expected) +
      ", got " + JSON.stringify(actual));
  }
}
function assertThrows(fn, pattern) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  if (!error || (pattern && !pattern.test(error.message))) throw new Error("expected throw " + pattern);
}

assertDeepEqual(medianSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3),
  [1, -1, -1, 3, 5, 6], "odd-sized windows");
assertDeepEqual(medianSlidingWindow([1, 4, 2, 3], 4), [2.5], "even-sized window");
assertDeepEqual(medianSlidingWindow([2, 2, 2, 2], 2), [2, 2, 2], "duplicate values");
assertDeepEqual(medianSlidingWindow([-5, -1, -9, -3], 1), [-5, -1, -9, -3], "window size one");

const state = new SlidingWindowMedian();
state.add(4).add(1).add(4).add(2);
assertDeepEqual(state.median(), 3, "two-heap median");
state.remove(4);
assertDeepEqual(state.median(), 2, "lazy deletion with duplicate values");
assertThrows(() => state.remove(99), /not in the window/);
assertThrows(() => medianSlidingWindow([1, 2], 0), /windowSize/);
assertThrows(() => new SlidingWindowMedian().add(Infinity), /finite/);

let seed = 123456789;
function randomInt(max) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % max;
}
for (let trial = 0; trial < 120; trial++) {
  const length = 1 + randomInt(18);
  const values = Array.from({ length }, () => randomInt(13) - 6);
  const k = 1 + randomInt(length);
  const expected = [];
  for (let start = 0; start + k <= length; start++) {
    const sorted = values.slice(start, start + k).sort((a, b) => a - b);
    expected.push(k % 2 ? sorted[k >>> 1] :
      (sorted[k / 2 - 1] + sorted[k / 2]) / 2);
  }
  assertDeepEqual(medianSlidingWindow(values, k), expected, "random differential case");
}

if (typeof module !== "undefined") module.exports = {
  BinaryHeap, SlidingWindowMedian, medianSlidingWindow
};
