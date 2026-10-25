/**
 * StreamingMedian maintains the median of numbers as values arrive.
 * Two heaps keep the lower half's max at the root and upper half's min at the root.
 * Time: O(log n) per insertion, O(1) median lookup.
 */
class Heap {
  constructor(compare) { this.data = []; this.compare = compare; }
  get size() { return this.data.length; }
  peek() { return this.data[0]; }
  push(value) {
    this.data.push(value);
    let i = this.data.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (!this.compare(this.data[i], this.data[p])) break;
      [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
      i = p;
    }
  }
  pop() {
    if (!this.data.length) return undefined;
    const root = this.data[0], last = this.data.pop();
    if (this.data.length) {
      this.data[0] = last;
      let i = 0;
      while (true) {
        let best = i, left = i * 2 + 1, right = left + 1;
        if (left < this.data.length && this.compare(this.data[left], this.data[best])) best = left;
        if (right < this.data.length && this.compare(this.data[right], this.data[best])) best = right;
        if (best === i) break;
        [this.data[i], this.data[best]] = [this.data[best], this.data[i]];
        i = best;
      }
    }
    return root;
  }
}

class StreamingMedian {
  constructor() {
    this.lower = new Heap((a, b) => a > b);
    this.upper = new Heap((a, b) => a < b);
  }
  add(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Expected a finite number");
    if (!this.lower.size || value <= this.lower.peek()) this.lower.push(value);
    else this.upper.push(value);
    if (this.lower.size > this.upper.size + 1) this.upper.push(this.lower.pop());
    if (this.upper.size > this.lower.size) this.lower.push(this.upper.pop());
    return this.median();
  }
  median() {
    if (!this.lower.size) return null;
    return this.lower.size === this.upper.size
      ? (this.lower.peek() + this.upper.peek()) / 2
      : this.lower.peek();
  }
}

const stream = new StreamingMedian();
[5, 1, 9, 2].forEach(n => stream.add(n));
console.assert(stream.median() === 3.5);
stream.add(7);
console.assert(stream.median() === 5);
console.log("streaming median practice passed");
