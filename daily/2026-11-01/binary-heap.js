const assert = require('node:assert/strict');

class BinaryHeap {
  constructor(compare = (a, b) => a - b) { this.data = []; this.compare = compare; }
  get size() { return this.data.length; }
  peek() { return this.data[0]; }
  push(value) {
    const a = this.data; a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], a[i]) <= 0) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
    return this.size;
  }
  pop() {
    const a = this.data;
    if (!a.length) return undefined;
    const root = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      while (true) {
        let best = i, l = 2*i+1, r = l+1;
        if (l < a.length && this.compare(a[l], a[best]) < 0) best = l;
        if (r < a.length && this.compare(a[r], a[best]) < 0) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]]; i = best;
      }
    }
    return root;
  }
}
const h = new BinaryHeap();
[7,2,9,1,5].forEach(v => h.push(v));
assert.deepEqual(Array.from({length:5}, () => h.pop()), [1,2,5,7,9]);
assert.equal(h.pop(), undefined);
const max = new BinaryHeap((a,b) => b-a); [1,3,2].forEach(v => max.push(v));
assert.equal(max.pop(), 3);
console.log('Binary heap tests passed');