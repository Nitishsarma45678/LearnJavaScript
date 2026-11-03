const assert = require('node:assert/strict');

function priorityFor(value) {
  let hash = 2166136261;
  for (const ch of String(value)) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function compare(aStart, aId, bStart, bId) {
  return aStart - bStart || String(aId).localeCompare(String(bId));
}
function update(node) {
  if (node) node.maxEnd = Math.max(node.end, node.left?.maxEnd ?? -Infinity, node.right?.maxEnd ?? -Infinity);
  return node;
}
function rotateRight(root) {
  const next = root.left; root.left = next.right; next.right = update(root); return update(next);
}
function rotateLeft(root) {
  const next = root.right; root.right = next.left; next.left = update(root); return update(next);
}
function merge(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.priority < right.priority) { left.right = merge(left.right, right); return update(left); }
  right.left = merge(left, right.left); return update(right);
}
function insertNode(root, node) {
  if (!root) return node;
  if (compare(node.start, node.id, root.start, root.id) < 0) {
    root.left = insertNode(root.left, node);
    if (root.left.priority < root.priority) root = rotateRight(root);
  } else {
    root.right = insertNode(root.right, node);
    if (root.right.priority < root.priority) root = rotateLeft(root);
  }
  return update(root);
}
function removeNode(root, start, id) {
  if (!root) return null;
  const order = compare(start, id, root.start, root.id);
  if (order < 0) root.left = removeNode(root.left, start, id);
  else if (order > 0) root.right = removeNode(root.right, start, id);
  else return merge(root.left, root.right);
  return update(root);
}

class IntervalTreap {
  constructor() { this.root = null; this.byId = new Map(); }
  insert(start, end, id) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new RangeError('Invalid interval');
    if (id === undefined || this.byId.has(String(id))) throw new Error('Interval id must be unique');
    const key = String(id);
    const node = { start, end, id: key, priority: priorityFor(key), maxEnd: end, left: null, right: null };
    this.root = insertNode(this.root, node); this.byId.set(key, start);
    return this;
  }
  remove(id) {
    const key = String(id);
    if (!this.byId.has(key)) return false;
    this.root = removeNode(this.root, this.byId.get(key), key);
    this.byId.delete(key); return true;
  }
  queryOverlap(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new RangeError('Invalid query');
    const found = [];
    const visit = node => {
      if (!node) return;
      if (node.left && node.left.maxEnd >= start) visit(node.left);
      if (node.start <= end && node.end >= start) found.push({ id: node.id, start: node.start, end: node.end });
      if (node.start <= end && node.right && node.right.maxEnd >= start) visit(node.right);
    };
    visit(this.root);
    return found;
  }
  queryPoint(point) { return this.queryOverlap(point, point); }
}

const tree = new IntervalTreap();
tree.insert(10, 20, 'a').insert(15, 18, 'b').insert(30, 40, 'c').insert(5, 12, 'd');
assert.deepEqual(tree.queryPoint(11).map(x => x.id), ['d', 'a']);
assert.deepEqual(tree.queryOverlap(17, 31).map(x => x.id), ['a', 'b', 'c']);
assert.equal(tree.remove('b'), true);
assert.deepEqual(tree.queryPoint(17).map(x => x.id), ['a']);
assert.equal(tree.remove('missing'), false);
assert.throws(() => tree.insert(3, 2, 'bad'), RangeError);
assert.throws(() => tree.insert(1, 2, 'a'), /unique/);
console.log('Interval treap tests passed');