// Persistent segment tree: point updates create new versions while old roots remain valid.
// Range queries use half-open intervals [start, end).
function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(message || `Expected ${expected}, received ${actual}`);
}

function buildTree(values, left, right) {
  if (right - left === 1) return { sum: values[left], left: null, right: null };
  const mid = (left + right) >> 1;
  const a = buildTree(values, left, mid);
  const b = buildTree(values, mid, right);
  return { sum: a.sum + b.sum, left: a, right: b };
}

function updateTree(node, left, right, index, value) {
  if (right - left === 1) return { sum: value, left: null, right: null };
  const mid = (left + right) >> 1;
  let nextLeft = node.left;
  let nextRight = node.right;
  if (index < mid) nextLeft = updateTree(node.left, left, mid, index, value);
  else nextRight = updateTree(node.right, mid, right, index, value);
  return { sum: nextLeft.sum + nextRight.sum, left: nextLeft, right: nextRight };
}

function queryTree(node, left, right, queryLeft, queryRight) {
  if (queryRight <= left || right <= queryLeft) return 0;
  if (queryLeft <= left && right <= queryRight) return node.sum;
  const mid = (left + right) >> 1;
  return queryTree(node.left, left, mid, queryLeft, queryRight)
    + queryTree(node.right, mid, right, queryLeft, queryRight);
}

class PersistentSegmentTree {
  constructor(values) {
    if (!Array.isArray(values) || values.length === 0 || values.some(value => !Number.isFinite(value))) {
      throw new TypeError("values must be a non-empty array of finite numbers");
    }
    this.length = values.length;
    this.roots = [buildTree(values, 0, values.length)];
  }

  _root(version) {
    if (!Number.isInteger(version) || version < 0 || version >= this.roots.length) {
      throw new RangeError("unknown version");
    }
    return this.roots[version];
  }

  update(version, index, value) {
    const root = this._root(version);
    if (!Number.isInteger(index) || index < 0 || index >= this.length) throw new RangeError("index out of range");
    if (!Number.isFinite(value)) throw new TypeError("value must be finite");
    const nextRoot = updateTree(root, 0, this.length, index, value);
    this.roots.push(nextRoot);
    return this.roots.length - 1;
  }

  query(version, start, end) {
    const root = this._root(version);
    if (!Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || end < start || end > this.length) {
      throw new RangeError("invalid query range");
    }
    return queryTree(root, 0, this.length, start, end);
  }
}

async function runTests() {
  const tree = new PersistentSegmentTree([2, 1, 3, 4, 5]);
  assertEqual(tree.query(0, 0, 5), 15);
  assertEqual(tree.query(0, 1, 4), 8);
  const v1 = tree.update(0, 1, 10);
  assertEqual(v1, 1);
  assertEqual(tree.query(v1, 0, 5), 24);
  assertEqual(tree.query(0, 0, 5), 15, "old version must remain unchanged");
  const v2 = tree.update(v1, 4, -2);
  assertEqual(tree.query(v2, 2, 5), 5);
  assertEqual(tree.query(v1, 2, 5), 12);
  assertEqual(tree.query(v2, 3, 3), 0);
  let threw = false;
  try { tree.query(99, 0, 1); } catch (error) { threw = error instanceof RangeError; }
  assert(threw, "unknown version must throw");
  console.log("Persistent segment tree tests passed");
}
runTests().catch(error => { console.error(error); process.exitCode = 1; });
