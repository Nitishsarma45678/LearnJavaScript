'use strict';

// Mutable rope backed by an implicit treap. Operations are expected O(log n).
// Indices count Unicode code points, not UTF-16 code units.
function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error((message || "Values differ") +
    ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
class RopeNode {
  constructor(value, priority) {
    this.value = value; this.priority = priority;
    this.left = null; this.right = null; this.size = 1; this.reversed = false;
  }
}
class TreapRope {
  constructor(text = "", seed = 0x6d2b79f5) {
    if (typeof text !== "string") throw new TypeError("initial text must be a string");
    this.seed = seed >>> 0; this.root = null;
    for (const char of Array.from(text)) this.root = this._merge(this.root, new RopeNode(char, this._priority()));
  }
  get length() { return this._size(this.root); }
  _size(node) { return node ? node.size : 0; }
  _priority() {
    let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0; return this.seed;
  }
  _pull(node) {
    if (node) node.size = 1 + this._size(node.left) + this._size(node.right);
    return node;
  }
  _reverse(node) {
    if (!node) return;
    [node.left, node.right] = [node.right, node.left];
    node.reversed = !node.reversed;
  }
  _push(node) {
    if (!node || !node.reversed) return;
    this._reverse(node.left); this._reverse(node.right); node.reversed = false;
  }
  _merge(left, right) {
    if (!left) return right;
    if (!right) return left;
    if (left.priority <= right.priority) {
      this._push(left); left.right = this._merge(left.right, right); return this._pull(left);
    }
    this._push(right); right.left = this._merge(left, right.left); return this._pull(right);
  }
  _split(node, count) {
    if (!node) return [null, null];
    this._push(node);
    const leftSize = this._size(node.left);
    if (count <= leftSize) {
      const parts = this._split(node.left, count);
      node.left = parts[1]; return [parts[0], this._pull(node)];
    }
    const parts = this._split(node.right, count - leftSize - 1);
    node.right = parts[0]; return [this._pull(node), parts[1]];
  }
  _checkIndex(index, allowEnd = true) {
    const max = allowEnd ? this.length : this.length - 1;
    if (!Number.isInteger(index) || index < 0 || index > max) throw new RangeError("index out of range");
  }
  _checkRange(start, count) {
    if (!Number.isInteger(start) || !Number.isInteger(count) ||
        start < 0 || count < 0 || start + count > this.length) throw new RangeError("invalid rope range");
  }
  insert(index, text) {
    this._checkIndex(index);
    if (typeof text !== "string") throw new TypeError("inserted text must be a string");
    const parts = this._split(this.root, index);
    let middle = null;
    for (const char of Array.from(text)) middle = this._merge(middle, new RopeNode(char, this._priority()));
    this.root = this._merge(this._merge(parts[0], middle), parts[1]); return this;
  }
  delete(start, count) {
    this._checkRange(start, count);
    const first = this._split(this.root, start), second = this._split(first[1], count);
    const removed = this._string(second[0]);
    this.root = this._merge(first[0], second[1]); return removed;
  }
  reverse(start, count) {
    this._checkRange(start, count);
    const first = this._split(this.root, start), second = this._split(first[1], count);
    this._reverse(second[0]);
    this.root = this._merge(this._merge(first[0], second[0]), second[1]); return this;
  }
  slice(start, count) {
    this._checkRange(start, count);
    const first = this._split(this.root, start), second = this._split(first[1], count);
    const result = this._string(second[0]);
    this.root = this._merge(this._merge(first[0], second[0]), second[1]); return result;
  }
  charAt(index) { this._checkIndex(index, false); return this.slice(index, 1); }
  _string(node) {
    const output = [];
    const visit = (current) => {
      if (!current) return;
      this._push(current); visit(current.left); output.push(current.value); visit(current.right);
    };
    visit(node); return output.join("");
  }
  toString() { return this._string(this.root); }
}
function runTests() {
  const rope = new TreapRope("A🙂BC");
  equal(rope.length, 4); equal(rope.charAt(1), "🙂");
  rope.insert(2, "xy"); equal(rope.toString(), "A🙂xyBC");
  equal(rope.delete(1, 2), "🙂x"); equal(rope.toString(), "AyBC");
  rope.reverse(1, 3); equal(rope.toString(), "ACBy");
  equal(rope.slice(1, 2), "CB"); equal(rope.toString(), "ACBy");
  let rangeRejected = false;
  try { rope.insert(-1, "x"); } catch (error) { rangeRejected = error instanceof RangeError; }
  assert(rangeRejected);
  let seed = 123456789;
  const random = (n) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  const model = Array.from("rope🙂editor"), tested = new TreapRope(model.join(""), 987654321);
  for (let step = 0; step < 350; step++) {
    const operation = random(4), start = random(model.length + 1), count = random(model.length - start + 1);
    if (operation === 0) {
      const text = ["", "q", "🙂", "ab"][random(4)];
      tested.insert(start, text); model.splice(start, 0, ...Array.from(text));
    } else if (operation === 1) {
      equal(tested.delete(start, count), model.splice(start, count).join(""));
    } else if (operation === 2) {
      tested.reverse(start, count);
      model.splice(start, count, ...model.slice(start, start + count).reverse());
    } else equal(tested.slice(start, count), model.slice(start, start + count).join(""));
    equal(tested.toString(), model.join(""), "randomized rope/model mismatch");
    equal(tested.length, model.length);
  }
  console.log("Treap rope editor: all tests passed");
}
if (typeof module !== "undefined" && require.main === module) runTests();
if (typeof module !== "undefined") module.exports = { TreapRope };