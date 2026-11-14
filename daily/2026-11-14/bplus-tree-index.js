'use strict';

// B+ tree ordered map. Internal nodes store right-child minimum separators;
// leaf nodes own values and form a doubly linked list for range scans.
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const lower = (a, x, c) => { let l = 0, r = a.length; while (l < r) { const m = (l + r) >>> 1; if (c(a[m], x) < 0) l = m + 1; else r = m; } return l; };

class BPlusTree {
  constructor(order = 5, compare = cmp) {
    if (!Number.isInteger(order) || order < 3 || typeof compare !== 'function') throw new TypeError('invalid order/comparator');
    this.order = order; this.max = order - 1; this.minLeaf = Math.ceil(this.max / 2);
    this.minChildren = Math.ceil(order / 2); this.compare = compare;
    this.root = this.leaf(); this.first = this.root; this.size = 0;
  }
  leaf() { return { leaf: true, keys: [], values: [], prev: null, next: null }; }
  internal(children) { const n = { leaf: false, keys: [], children }; this.refresh(n); return n; }
  firstKey(n) { while (!n.leaf) n = n.children[0]; if (!n.keys.length) throw Error('empty child leaf'); return n.keys[0]; }
  refresh(n) { if (!n.leaf) n.keys = n.children.slice(1).map(x => this.firstKey(x)); }
  childIndex(n, key) { let l = 0, r = n.keys.length; while (l < r) { const m = (l + r) >>> 1; if (this.compare(key, n.keys[m]) >= 0) l = m + 1; else r = m; } return l; }
  findLeaf(key) { let n = this.root; while (!n.leaf) n = n.children[this.childIndex(n, key)]; return n; }
  has(key) { const n = this.findLeaf(key), i = lower(n.keys, key, this.compare); return i < n.keys.length && this.compare(n.keys[i], key) === 0; }
  get(key) { const n = this.findLeaf(key), i = lower(n.keys, key, this.compare); return i < n.keys.length && this.compare(n.keys[i], key) === 0 ? n.values[i] : undefined; }
  set(key, value) { const split = this.insert(this.root, key, value); if (split) this.root = this.internal([this.root, split]); return this; }
  insert(n, key, value) {
    if (n.leaf) {
      const i = lower(n.keys, key, this.compare);
      if (i < n.keys.length && this.compare(n.keys[i], key) === 0) { n.values[i] = value; return null; }
      n.keys.splice(i, 0, key); n.values.splice(i, 0, value); this.size++;
      if (n.keys.length <= this.max) return null;
      const cut = Math.ceil(n.keys.length / 2), right = this.leaf();
      right.keys = n.keys.splice(cut); right.values = n.values.splice(cut);
      right.next = n.next; right.prev = n; if (right.next) right.next.prev = right; n.next = right;
      return right;
    }
    const i = this.childIndex(n, key), right = this.insert(n.children[i], key, value);
    if (right) n.children.splice(i + 1, 0, right);
    this.refresh(n);
    if (n.children.length <= this.order) return null;
    const cut = Math.ceil(n.children.length / 2), sibling = this.internal(n.children.splice(cut));
    this.refresh(n); return sibling;
  }
  delete(key) {
    if (!this.remove(this.root, key)) return false;
    if (!this.root.leaf && this.root.children.length === 1) this.root = this.root.children[0];
    this.first = this.leftmost(this.root); return true;
  }
  leftmost(n) { while (!n.leaf) n = n.children[0]; return n; }
  remove(n, key) {
    if (n.leaf) {
      const i = lower(n.keys, key, this.compare);
      if (i === n.keys.length || this.compare(n.keys[i], key) !== 0) return false;
      n.keys.splice(i, 1); n.values.splice(i, 1); this.size--; return true;
    }
    const i = this.childIndex(n, key);
    if (!this.remove(n.children[i], key)) return false;
    this.rebalance(n, i); this.refresh(n); return true;
  }
  rebalance(parent, i) {
    const child = parent.children[i], leaf = child.leaf;
    const count = n => n.leaf ? n.keys.length : n.children.length;
    const minimum = leaf ? this.minLeaf : this.minChildren;
    if (count(child) >= minimum) return;
    const left = parent.children[i - 1], right = parent.children[i + 1];
    if (left && count(left) > minimum) {
      if (leaf) { child.keys.unshift(left.keys.pop()); child.values.unshift(left.values.pop()); }
      else { child.children.unshift(left.children.pop()); this.refresh(left); this.refresh(child); }
      return;
    }
    if (right && count(right) > minimum) {
      if (leaf) { child.keys.push(right.keys.shift()); child.values.push(right.values.shift()); }
      else { child.children.push(right.children.shift()); this.refresh(right); this.refresh(child); }
      return;
    }
    if (left) {
      if (leaf) {
        left.keys.push(...child.keys); left.values.push(...child.values);
        left.next = child.next; if (child.next) child.next.prev = left;
      } else { left.children.push(...child.children); this.refresh(left); }
      parent.children.splice(i, 1);
    } else if (right) {
      if (leaf) {
        child.keys.push(...right.keys); child.values.push(...right.values);
        child.next = right.next; if (right.next) right.next.prev = child;
      } else { child.children.push(...right.children); this.refresh(child); }
      parent.children.splice(i + 1, 1);
    }
  }
  *range(from, to, options = {}) {
    const includeFrom = options.includeFrom !== false, includeTo = options.includeTo !== false;
    if (from !== undefined && to !== undefined && this.compare(from, to) > 0) return;
    let n = from === undefined ? this.first : this.findLeaf(from);
    let i = from === undefined ? 0 : lower(n.keys, from, this.compare);
    while (n) {
      for (; i < n.keys.length; i++) {
        const k = n.keys[i];
        if (from !== undefined && (this.compare(k, from) < 0 || (!includeFrom && this.compare(k, from) === 0))) continue;
        if (to !== undefined && (this.compare(k, to) > 0 || (!includeTo && this.compare(k, to) === 0))) return;
        yield [k, n.values[i]];
      }
      n = n.next; i = 0;
    }
  }
  entries() { return Array.from(this.range()); }
  validate() {
    const errors = [], leaves = []; let depth = null;
    const visit = (n, d, root) => {
      if (n.leaf) {
        if (!root && n.keys.length < this.minLeaf) errors.push('leaf underflow');
        if (n.keys.length > this.max || n.keys.length !== n.values.length) errors.push('leaf size mismatch');
        for (let i = 1; i < n.keys.length; i++) if (this.compare(n.keys[i - 1], n.keys[i]) >= 0) errors.push('leaf order');
        if (depth === null) depth = d; else if (depth !== d) errors.push('unequal leaf depth');
        leaves.push(n); return n.keys[0];
      }
      if (n.children.length < (root ? 2 : this.minChildren) || n.children.length > this.order) errors.push('internal occupancy');
      if (n.keys.length !== n.children.length - 1) errors.push('separator count');
      let max;
      for (let i = 0; i < n.children.length; i++) {
        const min = visit(n.children[i], d + 1, false);
        if (i && this.compare(n.keys[i - 1], min) !== 0) errors.push('bad separator');
        if (i && this.compare(max, min) >= 0) errors.push('overlapping children');
        let last = n.children[i]; while (!last.leaf) last = last.children[last.children.length - 1];
        max = last.keys[last.keys.length - 1];
      }
      return this.firstKey(n);
    };
    visit(this.root, 0, true);
    for (let i = 0; i < leaves.length; i++) {
      if (leaves[i].prev !== (leaves[i - 1] || null) || leaves[i].next !== (leaves[i + 1] || null)) errors.push('broken leaf chain');
    }
    if (this.first !== leaves[0] || leaves.reduce((s, n) => s + n.keys.length, 0) !== this.size) errors.push('size/first-leaf mismatch');
    return { valid: errors.length === 0, errors, height: depth === null ? 0 : depth + 1 };
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  for (const order of [3, 4, 5, 7]) {
    const tree = new BPlusTree(order), reference = new Map(); let seed = 8128 + order;
    const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    for (let step = 0; step < 1400; step++) {
      const key = random(180);
      if (random(3) === 0) assert.equal(tree.delete(key), reference.delete(key));
      else { const value = 'v' + step; tree.set(key, value); reference.set(key, value); }
      const report = tree.validate(); assert.equal(report.valid, true, report.errors.join(','));
      assert.deepEqual(tree.entries(), [...reference].sort((a, b) => a[0] - b[0]));
    }
    assert.equal(tree.get(999), undefined);
  }
  console.log('B+ Tree Index: all tests passed');
}
module.exports = { BPlusTree };
