// Rollback Disjoint Set Union (DSU).
// Deliberately avoids path compression so every union can be undone in O(1).
function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(message || `Expected ${expected}, received ${actual}`);
}

class RollbackDSU {
  constructor(count) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError("count must be a non-negative integer");
    this.parent = Array.from({ length: count }, (_, i) => i);
    this.size = Array(count).fill(1);
    this.components = count;
    this.history = [];
  }

  _check(x) {
    if (!Number.isInteger(x) || x < 0 || x >= this.parent.length) throw new RangeError("vertex out of range");
  }

  find(x) {
    this._check(x);
    while (this.parent[x] !== x) x = this.parent[x];
    return x;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  componentSize(x) {
    return this.size[this.find(x)];
  }

  snapshot() {
    return this.history.length;
  }

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return false;

    if (this.size[rootA] < this.size[rootB]) [rootA, rootB] = [rootB, rootA];
    this.history.push({
      childRoot: rootB,
      parentRoot: rootA,
      previousParentSize: this.size[rootA]
    });
    this.parent[rootB] = rootA;
    this.size[rootA] += this.size[rootB];
    this.components--;
    return true;
  }

  rollback(snapshot) {
    if (!Number.isInteger(snapshot) || snapshot < 0 || snapshot > this.history.length) {
      throw new RangeError("invalid snapshot");
    }
    while (this.history.length > snapshot) {
      const change = this.history.pop();
      this.parent[change.childRoot] = change.childRoot;
      this.size[change.parentRoot] = change.previousParentSize;
      this.components++;
    }
  }
}

async function runTests() {
  const dsu = new RollbackDSU(6);
  const initial = dsu.snapshot();
  assert(dsu.union(0, 1));
  const afterFirst = dsu.snapshot();
  assert(dsu.union(1, 2));
  assert(dsu.connected(0, 2));
  assertEqual(dsu.componentSize(2), 3);
  assertEqual(dsu.components, 4);
  assert(!dsu.union(0, 2), "redundant union should not change the history");
  assertEqual(dsu.snapshot(), afterFirst + 1);
  dsu.rollback(afterFirst);
  assert(!dsu.connected(0, 2));
  assertEqual(dsu.componentSize(0), 2);
  assertEqual(dsu.components, 5);
  dsu.rollback(initial);
  assert(!dsu.connected(0, 1));
  assertEqual(dsu.components, 6);
  let threw = false;
  try { dsu.rollback(99); } catch (error) { threw = error instanceof RangeError; }
  assert(threw, "invalid snapshot must throw");
  console.log("Rollback DSU tests passed");
}
runTests().catch(error => { console.error(error); process.exitCode = 1; });
