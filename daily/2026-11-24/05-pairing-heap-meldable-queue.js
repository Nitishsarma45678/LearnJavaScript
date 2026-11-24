'use strict';

const assert = require('node:assert/strict');

class PairingHeap {
  constructor(compare = (a, b) => a - b) {
    this.compare = compare;
    this.root = null;
    this.size = 0;
  }

  _merge(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (this.compare(a.value, b.value) <= 0) {
      b.next = a.child;
      a.child = b;
      return a;
    }
    a.next = b.child;
    b.child = a;
    return b;
  }

  _mergePairs(first) {
    if (!first) return null;
    if (!first.next) return first;
    const a = first;
    const b = first.next;
    const rest = b.next;
    a.next = null;
    b.next = null;
    return this._merge(this._merge(a, b), this._mergePairs(rest));
  }

  push(value) {
    this.root = this._merge(this.root, { value, child: null, next: null });
    this.size++;
    return this;
  }

  peek() {
    return this.root ? this.root.value : undefined;
  }

  pop() {
    if (!this.root) return undefined;
    const value = this.root.value;
    this.root = this._mergePairs(this.root.child);
    this.size--;
    return value;
  }

  meld(other) {
    if (!(other instanceof PairingHeap)) throw new TypeError('Can only meld another PairingHeap');
    if (other === this) throw new TypeError('Cannot meld a heap with itself');
    this.root = this._merge(this.root, other.root);
    this.size += other.size;
    other.root = null;
    other.size = 0;
    return this;
  }

  isEmpty() {
    return this.size === 0;
  }
}

const first = new PairingHeap();
[9, 2, 7, 1].forEach(value => first.push(value));
const second = new PairingHeap();
[8, 3, 6, 4, 5].forEach(value => second.push(value));
first.meld(second);
assert.equal(second.isEmpty(), true);
assert.deepEqual(Array.from({ length: 9 }, () => first.pop()), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.equal(first.pop(), undefined);
const byLength = new PairingHeap((a, b) => a.length - b.length);
byLength.push('long').push('x').push('medium');
assert.equal(byLength.pop(), 'x');
assert.throws(() => first.meld(first), /itself/);
console.log('Pairing-heap examples passed.');

module.exports = { PairingHeap };
